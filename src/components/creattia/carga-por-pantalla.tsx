import { useEffect, useRef, useState, type CSSProperties, type ReactEventHandler } from 'react';
import { ratioDeImagen, registrarFalla, registrarImagen } from '../../lib/creattia/image-ready';
import { puedeRefirmarse, refirmarUrl, useUrlVigente } from '../../lib/creattia/generation-image';

/**
 * Las imágenes de las grillas se piden por pantallazo: primero lo que se mira.
 *
 * El problema que resuelve. En "Mis imágenes" la primera pantalla entraba bien y
 * de ahí en adelante la grilla quedaba llena de tarjetas con el cartel "Casi
 * listo…", y las fotos aparecían EMPEZANDO POR ABAJO DE TODO y subiendo, así que
 * lo que la persona tenía delante era lo último en llegar. Eran dos cosas
 * sumadas. Una: cada tarjeta, al montarse, encolaba su imagen en el precargador
 * de `image-ready` marcándola urgente, y urgente significaba meterla al FRENTE
 * de la cola — con ciento cincuenta tarjetas montándose de corrido, la cola
 * quedaba exactamente al revés del orden de la grilla. La otra, más de fondo: el
 * `<img>` no existía en el DOM hasta DESPUÉS de que esa descarga terminara, así
 * que `loading="lazy"` y `fetchPriority` no tenían nada que priorizar; cuando el
 * navegador por fin veía la imagen, el byte ya estaba en su caché.
 *
 * Quién manda ahora. Un solo mecanismo: este observador. La tarjeta le pone el
 * `src` a su `<img>` cuando entra en la zona cercana a la pantalla, y de ahí en
 * adelante la bajada la hace el navegador sobre el mismo elemento que se va a
 * mostrar, sin copia intermedia. A propósito NO se le agrega `loading="lazy"`
 * encima: serían dos porteros decidiendo lo mismo y volveríamos a tener dos
 * órdenes de carga peleándose. El precargador de `image-ready` queda para lo que
 * NO está en el DOM y por lo tanto ningún observador puede ver: las páginas de
 * un carrusel que todavía no se abrió.
 *
 * Por qué un observador y no alcanzaba con `loading="lazy"`. Porque la cercanía
 * a la pantalla también tiene que decidir qué rutas se mandan a firmar a
 * Supabase. Sin URL firmada no hay `src`, y eso el navegador no lo puede
 * anticipar solo: alguien tiene que avisarle que ese anuncio está por verse.
 */

/**
 * Cuánto se adelanta la carga.
 *
 * Pantalla y media hacia abajo, que en estas grillas son unas dos o tres filas
 * por delante: alcanza para que al scrollear a velocidad normal la foto ya esté
 * puesta, y es poco como para no terminar bajando la lista entera otra vez.
 * Hacia arriba con menos basta, porque lo que quedó atrás casi siempre ya se
 * pidió cuando se pasó por ahí.
 */
const MARGEN = '600px 0px 1500px 0px';

/**
 * Un solo observador para toda la app.
 *
 * Una instancia por tarjeta serían ciento cincuenta observadores mirando el
 * mismo scroll. Con uno compartido, el navegador calcula todas las
 * intersecciones en la misma pasada.
 */
let observador: IntersectionObserver | null = null;
const avisos = new Map<Element, () => void>();

function observarUnaVez(nodo: Element, aviso: () => void) {
	if (!observador) {
		observador = new IntersectionObserver((entradas) => {
			for (const entrada of entradas) {
				if (!entrada.isIntersecting) continue;
				const pendiente = avisos.get(entrada.target);
				// Se deja de mirar apenas se acercó: una imagen que ya se pidió no
				// vuelve a pedirse por alejarse y volver, y la lista de observados no
				// crece con tarjetas que ya no tienen nada que decidir.
				avisos.delete(entrada.target);
				observador?.unobserve(entrada.target);
				pendiente?.();
			}
		}, { rootMargin: MARGEN });
	}
	avisos.set(nodo, aviso);
	observador.observe(nodo);
	return () => {
		avisos.delete(nodo);
		observador?.unobserve(nodo);
	};
}

/**
 * ¿Este elemento está lo bastante cerca de la pantalla como para pedir su
 * contenido? Una vez que dice que sí, no vuelve atrás: lo que ya se bajó no se
 * tira por scrollear de más.
 */
export function useCercaDePantalla<T extends Element>() {
	const ref = useRef<T | null>(null);
	const [cerca, setCerca] = useState(false);

	useEffect(() => {
		if (cerca) return;
		const nodo = ref.current;
		if (!nodo) return;
		// Sin IntersectionObserver —o renderizando en el servidor— no hay forma de
		// saber qué se ve: se cargan todas, que es peor pero funciona.
		if (typeof IntersectionObserver === 'undefined') {
			setCerca(true);
			return;
		}
		return observarUnaVez(nodo, () => setCerca(true));
	}, [cerca]);

	return { ref, cerca };
}

/**
 * La imagen de una tarjeta de grilla: reserva su lugar, se pide sola cuando la
 * tarjeta se acerca a la pantalla y avisa cuando ya se ve.
 */
export function ImagenDeTarjeta({
	url,
	alt,
	className = '',
	style,
	prioritaria = false,
	reserva = 0.8,
	onCargada,
	onFalla,
	onContextMenu,
	onDragStart,
}: {
	url: string;
	alt: string;
	className?: string;
	style?: CSSProperties;
	/** Las de la primera pantalla: el navegador las pone delante del resto. */
	prioritaria?: boolean;
	/** Proporción ancho/alto con la que se reserva el lugar hasta que llega la foto. */
	reserva?: number;
	onCargada?: () => void;
	onFalla?: ReactEventHandler<HTMLImageElement>;
	onContextMenu?: ReactEventHandler<HTMLImageElement>;
	onDragStart?: ReactEventHandler<HTMLImageElement>;
}) {
	const { ref, cerca } = useCercaDePantalla<HTMLImageElement>();
	const [cargada, setCargada] = useState(false);
	/**
	 * La URL de verdad, que puede no ser la que llegó por props.
	 *
	 * Las firmas de Supabase vencen y las pantallas guardan en su estado la que
	 * les tocó al cargar el historial, que con las horas queda vieja. Acá se
	 * traduce a la que sirve ahora. Es a propósito que la traducción viva en este
	 * componente y no en quien lo usa: renovar hacia arriba obligaría a reescribir
	 * `history[i].imageUrl`, y eso re-renderiza la grilla entera y hace parpadear
	 * ciento cincuenta tarjetas que estaban perfectas.
	 */
	const vigente = useUrlVigente(url);
	// Contra qué URL ya se gastó el reintento. Va por URL y no por un booleano
	// porque la tarjeta de un carrusel cambia de página sin desmontarse: cada
	// página tiene derecho a su propio intento.
	const reintentada = useRef('');
	// Las páginas de un carrusel cambian dentro de la misma tarjeta: sin
	// reiniciar, la tarjeta seguiría creyendo que ya tiene puesta una foto que en
	// realidad es la anterior. Una renovación de firma NO pasa por acá —es la
	// misma imagen— y por eso no apaga el `cargada`: si lo hiciera, cada renovación
	// desvanecería la grilla entera de golpe.
	useEffect(() => { setCargada(false); }, [url]);

	const pedir = cerca && Boolean(vigente);
	const clases = `${className}${cargada ? ' cargada' : ''}`.trim();

	return (
		<img
			ref={ref}
			src={pedir ? vigente : undefined}
			/* Un `<img>` sin `src` dibuja su `alt` COMO TEXTO: hasta que la foto se
			   pide se veía el nombre del anuncio escrito en el lugar de la imagen.
			   Vacío significa "decorativa" y no dibuja nada; el texto de verdad entra
			   junto con la imagen, que es cuando sirve para algo. */
			alt={pedir ? alt : ''}
			className={clases || undefined}
			decoding="async"
			fetchPriority={prioritaria ? 'high' : 'auto'}
			style={{
				/* El lugar de la foto, reservado desde el primer frame: sin esto la
				   tarjeta nace de alto casi cero y pega un salto cuando llega la
				   imagen, empujando todo lo que había abajo. Se usa la proporción real
				   si ya se conoce de otra pantalla, y si no la vertical típica de un
				   anuncio. Al cargar se suelta, para que mande el tamaño verdadero. */
				aspectRatio: cargada ? undefined : (ratioDeImagen(url) || reserva),
				...style,
			}}
			onLoad={(evento) => {
				const imagen = evento.currentTarget;
				// Queda anotada para el resto de la app: la misma referencia aparece en
				// la grilla, en el visor y en el historial, y ahí ya se sabe su
				// proporción sin tener que esperar a que baje de nuevo.
				registrarImagen(url, imagen.naturalWidth && imagen.naturalHeight ? imagen.naturalWidth / imagen.naturalHeight : 0);
				setCargada(true);
				onCargada?.();
			}}
			onError={(evento) => {
				// Una firma vencida devuelve 400 y el `<img>` se queda roto hasta que
				// alguien recargue la página. El reloj que renueva firmas cubre el caso
				// normal, pero no llega cuando la pestaña estuvo dormida horas y el
				// navegador reintenta la bajada apenas despierta. Se pide una firma
				// nueva y se reintenta una sola vez; cuando la traiga, el render la toma
				// solo. Esto es únicamente para lo que firmamos nosotros: una referencia
				// de otro bucket sigue derecho al camino de siempre.
				if (puedeRefirmarse(vigente) && reintentada.current !== vigente) {
					reintentada.current = vigente;
					void refirmarUrl(vigente).then((nueva) => { if (!nueva) registrarFalla(url); });
					return;
				}
				// Quien se hace cargo del error, se hace cargo del todo. La biblioteca
				// reintenta una vez —el CDN devuelve 429 bajo carga— y si acá se
				// marcara la falla al primer error, la pantalla sacaría la tarjeta del
				// render antes del reintento y el reintento no llegaría a ocurrir.
				if (onFalla) { onFalla(evento); return; }
				registrarFalla(url);
			}}
			onContextMenu={onContextMenu}
			onDragStart={onDragStart}
		/>
	);
}
