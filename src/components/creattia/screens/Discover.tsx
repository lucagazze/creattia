import { triggerConfetti } from '../../../lib/creattia/confetti';
import { imagenFallada, imagenLista, precargarImagenes, useAvisoDeCarga } from '../../../lib/creattia/image-ready';
import { useReferenceUrls } from '../../../lib/creattia/reference-urls';
import { sfx } from '../../../lib/creattia/sfx';
import { Icon } from '../Icon';
import { useEffect, useRef, useState } from 'react';
/** Descubrimiento: grilla dopamínica de 4 ganadores y el modo swipe completo. */

/**
 * Cuántas tarjetas del pozo se dejan listas por adelantado.
 *
 * El mazo se reponía con la tarjeta siguiente sin más, y su imagen empezaba a
 * bajar en ese momento: entraba una tarjeta vacía que se llenaba un segundo
 * después. Con un colchón preparado, cada vez que descartás una la que ocupa su
 * lugar ya está decodificada y aparece completa.
 */
const COLCHON = 8;

export function DiscoverGrid({ pool, likedPaths, onLike, onUse, onOpenSwipe, onSeen }: { pool: any[]; likedPaths: Set<string>; onLike: (path: string) => void; onUse: (path: string) => void; onOpenSwipe: () => void; onSeen?: (path: string) => void }) {
	const [dealt, setDealt] = useState<{ cards: any[]; cursor: number }>({ cards: [], cursor: 0 });
	const [leaving, setLeaving] = useState<Record<string, 'left' | 'right'>>({});
	const [dragX, setDragX] = useState<{ path: string; x: number } | null>(null);
	const dragStartRef = useRef<{ path: string; x: number; moved: boolean } | null>(null);
	// El bucket de referencias es privado: las URLs se piden firmadas al servidor.
	const signedUrls = useReferenceUrls(pool.map((item: any) => item.imagePath));

	function resolveUrl(item: any) {
		return item?.imageUrl || signedUrls[item?.imagePath] || '';
	}

	/**
	 * El pozo, ya con sus imágenes pintadas.
	 *
	 * Se repartían las cuatro primeras del pozo apenas llegaba la lista, con las
	 * imágenes todavía en camino: la sección aparecía como cuatro marcos vacíos
	 * que se iban llenando de a uno. Ahora solo entran al mazo las que están
	 * decodificadas, y se prepara un colchón por delante para que la reposición
	 * después de cada elección sea instantánea.
	 */
	useAvisoDeCarga();
	const listas = pool.filter((item: any) => imagenLista(resolveUrl(item)));
	useEffect(() => {
		const objetivo = pool.slice(0, dealt.cursor + COLCHON).map(resolveUrl).filter(Boolean);
		precargarImagenes(objetivo);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pool, signedUrls, dealt.cursor]);

	// El mazo se rearma cuando llega el pozo o cuando cambia de contenido. Antes
	// solo se repartía la primera vez, así que al llegar el catálogo completo
	// —que tarda más que la muestra— las cuatro tarjetas iniciales quedaban fijas.
	useEffect(() => {
		if (listas.length < 4) return;
		setDealt((previo) => {
			const vigentes = previo.cards.filter(Boolean);
			if (vigentes.length) return previo;
			return { cards: listas.slice(0, 4), cursor: 4 };
		});
		// `listas` se recalcula en cada render: depender del array entero volvería a
		// correr esto siempre. Lo único que puede habilitar el reparto es que haya
		// más imágenes listas.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [listas.length]);

	function replaceCard(path: string, direction: 'left' | 'right') {
		setLeaving((previous) => ({ ...previous, [path]: direction }));
		window.setTimeout(() => {
			setDealt((previous) => {
				// Al llegar al final se vuelve al principio del pozo en vez de dejar
				// huecos: antes la carta siguiente era `undefined`, se filtraba, y el
				// mazo se iba vaciando hasta que la sección entera desaparecía.
				//
				// Se repone desde las que YA están listas: si todavía no hay ninguna
				// preparada se usa el pozo completo, que es peor pero nunca deja un
				// hueco en la grilla.
				const fuente = listas.length > 4 ? listas : pool;
				const enMazo = new Set(previous.cards.filter(Boolean).map((card: any) => card.imagePath));
				let cursor = previous.cursor;
				let siguiente = null;
				for (let intentos = 0; intentos < fuente.length && !siguiente; intentos += 1) {
					const candidato = fuente[cursor % fuente.length];
					cursor += 1;
					if (candidato && candidato.imagePath !== path && !enMazo.has(candidato.imagePath)) siguiente = candidato;
				}
				return {
					cards: previous.cards.map((card) => card.imagePath === path ? siguiente : card).filter(Boolean),
					cursor,
				};
			});
			setLeaving((previous) => {
				const next = { ...previous };
				delete next[path];
				return next;
			});
		}, 240);
	}

	function like(item: any, flyDirection: 'left' | 'right' = 'right') {
		if (!likedPaths.has(item.imagePath)) onLike(item.imagePath);
		if (onSeen) onSeen(item.imagePath);
		try { sfx.playSuccess(); } catch { /* audio bloqueado */ }
		replaceCard(item.imagePath, flyDirection);
	}
	function pass(item: any, flyDirection: 'left' | 'right' = 'left') {
		if (onSeen) onSeen(item.imagePath);
		try { sfx.playWhoosh(); } catch { /* audio bloqueado */ }
		replaceCard(item.imagePath, flyDirection);
	}

	/**
	 * El encabezado se muestra desde el primer momento, con esqueletos debajo.
	 *
	 * Antes la sección entera no existía hasta tener las cuatro tarjetas: el
	 * inicio se dibujaba sin ella y después aparecía de golpe, empujando todo lo
	 * que había abajo. Reservar el lugar cuesta nada y saca ese salto.
	 */
	const repartidas = dealt.cards.length ? dealt.cards : [];

	return (
		<>
			<div className="studio-section-title">
				<div>
					<h2>Descubrí ganadores 🔥</h2>
					<p>Guardá los que van con tu marca o usalos directo. Entra uno nuevo con cada elección.</p>
				</div>
				<button className="studio-primary-button compact" style={{ width: 'auto', height: '38px', fontSize: '13px', padding: '0 16px', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={onOpenSwipe}><Icon name="plus" size={15}/><span className="discover-create-full">Crear imagen</span><span className="discover-create-short">Crear</span></button>
			</div>
			{!repartidas.length && (
				<div className="discover-grid" aria-hidden="true">
					{[0, 1, 2, 3].map((hueco) => <div key={hueco} className="discover-card-esqueleto" />)}
				</div>
			)}
			<div className="discover-grid">
				{repartidas.map((item) => {
					const exit = leaving[item.imagePath];
					const saved = likedPaths.has(item.imagePath);
					const drag = dragX && dragX.path === item.imagePath ? dragX.x : null;
					return (
						<article
							key={item.imagePath}
							style={{
								background: '#fff', border: '1px solid #e9e6ed', borderRadius: '16px', overflow: 'hidden',
								boxShadow: '0 6px 22px rgba(52,40,79,0.05)',
								transform: exit ? `translateX(${exit === 'right' ? 70 : -70}px) rotate(${exit === 'right' ? 6 : -6}deg)` : 'none',
								opacity: exit ? 0 : 1,
								transition: 'transform .24s ease, opacity .24s ease',
							}}
						>
							<div
								className="discover-card-media"
								onPointerDown={(event) => {
									dragStartRef.current = { path: item.imagePath, x: event.clientX, moved: false };
									(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
								}}
								onPointerMove={(event) => {
									const start = dragStartRef.current;
									if (!start || start.path !== item.imagePath) return;
									const deltaX = event.clientX - start.x;
									if (Math.abs(deltaX) > 6) start.moved = true;
									setDragX({ path: item.imagePath, x: deltaX });
								}}
								onPointerUp={() => {
									const start = dragStartRef.current;
									const deltaX = drag ?? 0;
									dragStartRef.current = null;
									setDragX(null);
									// Gesto: derecha descarta, izquierda guarda.
									if (deltaX > 90) { pass(item, 'right'); return; }
									if (deltaX < -90) { like(item, 'left'); return; }
									if (start && !start.moved) {
										try { sfx.playDock(); } catch { /* audio */ }
										onUse(item.imagePath);
									}
								}}
								onPointerCancel={() => { dragStartRef.current = null; setDragX(null); }}
								style={{
									position: 'relative', cursor: 'grab', touchAction: 'pan-y', userSelect: 'none',
									transform: drag !== null ? `translateX(${drag}px) rotate(${drag / 18}deg)` : 'none',
									transition: drag !== null ? 'none' : 'transform .18s ease',
								}}
							>
								{/* Ya está decodificada: la tarjeta no se reparte hasta que lo
								    esté, así que `lazy` solo agregaría un frame de retraso. */}
								<img src={resolveUrl(item)} alt={item.name || ''} loading="eager" decoding="async" draggable={false} style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} />
								<span style={{ position: 'absolute', top: '16px', left: '14px', zIndex: 4, padding: '6px 12px', borderRadius: '9px', border: '3px solid #16a34a', color: '#16a34a', fontWeight: 900, fontSize: '15px', letterSpacing: '.05em', transform: 'rotate(-12deg)', background: 'rgba(255,255,255,0.88)', opacity: drag !== null ? Math.min(1, Math.max(0, -drag / 90)) : 0, pointerEvents: 'none' }}>ME GUSTA</span>
								<span style={{ position: 'absolute', top: '16px', right: '14px', zIndex: 4, padding: '6px 12px', borderRadius: '9px', border: '3px solid #dc2626', color: '#dc2626', fontWeight: 900, fontSize: '15px', letterSpacing: '.05em', transform: 'rotate(12deg)', background: 'rgba(255,255,255,0.88)', opacity: drag !== null ? Math.min(1, Math.max(0, drag / 90)) : 0, pointerEvents: 'none' }}>PASO</span>
							</div>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '12px' }}>
								<button onClick={() => pass(item)} aria-label="Pasar" style={{ width: '44px', height: '44px', borderRadius: '50%', border: '2px solid #f1d5d5', background: '#fff', color: '#dc2626', fontSize: '18px', cursor: 'pointer' }}>✕</button>
								<button onClick={() => { try { sfx.playDock(); } catch { /* audio */ } onUse(item.imagePath); }} aria-label="Usar esta idea" style={{ height: '44px', padding: '0 24px', borderRadius: '999px', border: 0, background: 'linear-gradient(135deg, #744bde, #5b2fc9)', color: '#fff', fontSize: '15px', fontWeight: 800, letterSpacing: '.01em', cursor: 'pointer', boxShadow: '0 8px 22px rgba(116,75,222,0.32)' }}>Usar</button>
								<button onClick={() => like(item)} aria-label="Me gusta" style={{ width: '44px', height: '44px', borderRadius: '50%', border: saved ? 0 : '2px solid #d3ecdc', background: saved ? '#16a34a' : '#fff', color: saved ? '#fff' : '#16a34a', fontSize: '18px', cursor: 'pointer' }}>♥</button>
							</div>
						</article>
					);
				})}
			</div>
		</>
	);
}

export function DiscoverPage({ pool, likedPaths, onLike, onUse, onBack, onSaved }: { pool: any[]; likedPaths: Set<string>; onLike: (path: string) => void; onUse: (path: string) => void; onBack: () => void; onSaved: () => void }) {
	const [index, setIndex] = useState(0);
	const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
	const [flying, setFlying] = useState<'left' | 'right' | null>(null);
	const [sessionLikes, setSessionLikes] = useState(0);
	const [lastAction, setLastAction] = useState<{ index: number; liked: boolean } | null>(null);
	const startRef = useRef<{ x: number; y: number } | null>(null);
	const signedUrls = useReferenceUrls(pool.map((item: any) => item.imagePath));
	useAvisoDeCarga();

	function resolveUrl(item: any) {
		return item?.imageUrl || signedUrls[item?.imagePath] || '';
	}

	/**
	 * El colchón se mantiene por delante de donde estás.
	 *
	 * Deslizar tiene que poder ir más rápido que la red: se preparan las próximas
	 * doce y son urgentes, porque esto es lo único que la persona está mirando.
	 */
	useEffect(() => {
		precargarImagenes(pool.slice(index, index + COLCHON + 4).map(resolveUrl).filter(Boolean), true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pool, signedUrls, index]);

	/**
	 * El índice avanza sobre el pozo, no sobre "las que están listas".
	 *
	 * Filtrar el pozo por imágenes decodificadas parece más simple, pero la lista
	 * filtrada CRECE a medida que bajan las imágenes: el mismo índice pasaría a
	 * apuntar a otra tarjeta y verías repetidas o te saltearías algunas. Con el
	 * orden del pozo fijo, lo único que cambia es si la tarjeta de este índice ya
	 * se puede pintar.
	 *
	 * Las que fallaron se saltean solas: una imagen rota no puede dejar el mazo
	 * trabado esperándola.
	 */
	useEffect(() => {
		const actual = pool[index];
		if (actual && imagenFallada(resolveUrl(actual))) setIndex((previo) => previo + 1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pool, index, signedUrls]);

	const remaining = pool.slice(index, index + 3);
	const enTurno = remaining[0];
	const listaParaMostrar = imagenLista(resolveUrl(enTurno));
	const current = listaParaMostrar ? enTurno : undefined;
	// Hay tarjeta pero su imagen todavía baja: es carga, no "viste todas".
	const preparando = Boolean(enTurno) && !listaParaMostrar;

	// La acción (like/pass) y la dirección en la que vuela la tarjeta son cosas
	// distintas: los botones siempre vuelan para su lado de siempre, pero el
	// gesto de arrastrar tiene la acción invertida (derecha = pasar, izquierda
	// = me gusta), así que no pueden ir pegadas al mismo parámetro.
	function settle(action: 'like' | 'pass', flyDirection: 'left' | 'right') {
		if (!current || flying) return;
		setFlying(flyDirection);
		if (action === 'like') {
			if (!likedPaths.has(current.imagePath)) onLike(current.imagePath);
			try { sfx.playSuccess(); } catch { /* audio bloqueado */ }
			const nextLikes = sessionLikes + 1;
			setSessionLikes(nextLikes);
			if (nextLikes % 5 === 0) { try { triggerConfetti(); } catch { /* sin confetti */ } }
		} else {
			try { sfx.playWhoosh(); } catch { /* audio bloqueado */ }
		}
		setLastAction({ index, liked: action === 'like' });
		window.setTimeout(() => {
			setFlying(null);
			setDrag(null);
			setIndex((previous) => previous + 1);
		}, 240);
	}

	function undo() {
		if (!lastAction || flying) return;
		if (lastAction.liked) {
			const item = pool[lastAction.index];
			if (item && likedPaths.has(item.imagePath)) onLike(item.imagePath);
			setSessionLikes((previous) => Math.max(0, previous - 1));
		}
		setIndex(lastAction.index);
		setLastAction(null);
		try { sfx.playClick(); } catch { /* audio bloqueado */ }
	}

	function onPointerDown(event: React.PointerEvent) {
		if (flying) return;
		startRef.current = { x: event.clientX, y: event.clientY };
		(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
	}
	function onPointerMove(event: React.PointerEvent) {
		if (!startRef.current || flying) return;
		setDrag({ x: event.clientX - startRef.current.x, y: event.clientY - startRef.current.y });
	}
	function onPointerUp() {
		if (!startRef.current) return;
		const dx = drag?.x || 0;
		startRef.current = null;
		// Deslizar a la derecha descarta, a la izquierda guarda — invertido a
		// propósito respecto de los botones de abajo, que no se tocan.
		if (dx > 90) settle('pass', 'right');
		else if (dx < -90) settle('like', 'left');
		else setDrag(null);
	}

	const dx = flying === 'right' ? 640 : flying === 'left' ? -640 : (drag?.x || 0);
	const dy = flying ? -50 : (drag?.y || 0) * 0.25;
	const rotation = dx / 15;
	// Invertido a propósito: arrastrar a la derecha pasa, a la izquierda gusta.
	const passOpacity = Math.min(1, Math.max(0, dx / 90));
	const likeOpacity = Math.min(1, Math.max(0, -dx / 90));

	return (
		<section style={{ maxWidth: '860px', margin: '0 auto', padding: '4px 10px 30px' }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
				<button onClick={onBack} style={{ border: 0, background: 'transparent', color: '#716d79', cursor: 'pointer', fontSize: '14px', padding: 0 }}>← Inicio</button>
				<button onClick={onSaved} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '999px', border: '1px solid #eadfe8', background: '#fff', color: '#c2276f', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
					♥ {likedPaths.size} guardados
				</button>
			</div>
			<div style={{ textAlign: 'center', marginBottom: '16px' }}>
				<h1 style={{ margin: '0 0 4px', fontSize: '26px', color: '#19171d', letterSpacing: '-.02em' }}>Descubrí ganadores 🔥</h1>
				<p style={{ margin: 0, fontSize: '14px', color: '#716d79' }}>Izquierda para guardar · derecha para pasar · ⚡ para usarlo ya</p>
			</div>

			{preparando ? (
				/* Se mantiene el marco de la tarjeta con el mismo tamaño: cuando la
				   imagen entra, ocupa exactamente este lugar y nada se mueve. */
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
					<div className="discover-card-esqueleto" style={{ width: 'min(430px, 92vw)', height: 'min(560px, 64vh)', borderRadius: '20px' }} />
					<p style={{ margin: '18px 0 0', fontSize: '13px', color: '#8b8490', fontWeight: 700 }}>Preparando los ganadores…</p>
				</div>
			) : !current ? (
				<div style={{ textAlign: 'center', padding: '60px 20px' }}>
					<p style={{ fontSize: '38px', margin: '0 0 10px' }}>🎉</p>
					<h2 style={{ margin: '0 0 8px', fontSize: '20px', color: '#19171d' }}>¡Viste todos los de hoy!</h2>
					<p style={{ margin: '0 0 20px', fontSize: '14px', color: '#716d79' }}>Guardaste {sessionLikes} en esta sesión. Volvé mañana por más, o revisá tus guardados.</p>
					<button onClick={onSaved} style={{ padding: '13px 26px', borderRadius: '12px', border: 0, background: '#19171d', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>Ver mis guardados</button>
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
					<div style={{ position: 'relative', width: 'min(430px, 92vw)', height: 'min(560px, 64vh)', touchAction: 'pan-y' }}>
						{/* Las de atrás solo se asoman por el borde: si su imagen todavía
						    no está, se omiten en vez de dibujar un rectángulo vacío que
						    se nota detrás de la tarjeta de arriba. */}
						{remaining.slice(1).filter((item: any) => imagenLista(resolveUrl(item))).reverse().map((item, stackIndex, listaAtras) => {
							const depth = listaAtras.length - stackIndex;
							return (
								<img
									key={item.imagePath}
									src={resolveUrl(item)}
									alt=""
									draggable={false}
									style={{
										position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
										borderRadius: '20px', boxShadow: '0 16px 38px rgba(25,23,29,0.15)',
										transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`,
										filter: 'brightness(0.97)',
									}}
								/>
							);
						})}
						<div
							onPointerDown={onPointerDown}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
							onPointerCancel={onPointerUp}
							style={{
								position: 'absolute', inset: 0, cursor: 'grab', userSelect: 'none',
								transform: `translate(${dx}px, ${dy}px) rotate(${rotation}deg)`,
								transition: flying ? 'transform .24s ease-out, opacity .24s ease-out' : drag ? 'none' : 'transform .18s ease',
								opacity: flying ? 0 : 1,
							}}
						>
							<img src={resolveUrl(current)} alt={current.name || ''} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '20px', boxShadow: '0 26px 60px rgba(25,23,29,0.24)', pointerEvents: 'none' }} />
							<span style={{ position: 'absolute', top: '20px', left: '18px', padding: '8px 16px', borderRadius: '11px', border: '3.5px solid #16a34a', color: '#16a34a', fontWeight: 900, fontSize: '21px', letterSpacing: '.06em', transform: 'rotate(-12deg)', background: 'rgba(255,255,255,0.88)', opacity: likeOpacity }}>ME GUSTA</span>
							<span style={{ position: 'absolute', top: '20px', right: '18px', padding: '8px 16px', borderRadius: '11px', border: '3.5px solid #dc2626', color: '#dc2626', fontWeight: 900, fontSize: '21px', letterSpacing: '.06em', transform: 'rotate(12deg)', background: 'rgba(255,255,255,0.88)', opacity: passOpacity }}>PASO</span>
						</div>
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginTop: '22px' }}>
						<button onClick={undo} disabled={!lastAction} aria-label="Deshacer" style={{ width: '46px', height: '46px', borderRadius: '50%', border: '2px solid #e5e0ea', background: '#fff', color: lastAction ? '#8a831f' : '#cfcad6', fontSize: '18px', cursor: lastAction ? 'pointer' : 'default' }}>↩</button>
						<button onClick={() => settle('pass', 'left')} aria-label="Pasar" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #f1d5d5', background: '#fff', color: '#dc2626', fontSize: '25px', cursor: 'pointer', boxShadow: '0 10px 24px rgba(220,38,38,0.14)' }}>✕</button>
						<button onClick={() => { if (current) { try { sfx.playDock(); } catch { /* audio */ } onUse(current.imagePath); } }} aria-label="Usar este anuncio" style={{ width: '74px', height: '74px', borderRadius: '50%', border: 0, background: 'linear-gradient(135deg, #744bde, #5b2fc9)', color: '#fff', fontSize: '30px', cursor: 'pointer', boxShadow: '0 14px 34px rgba(116,75,222,0.4)' }}>⚡</button>
						<button onClick={() => settle('like', 'right')} aria-label="Me gusta" style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #d3ecdc', background: '#fff', color: '#16a34a', fontSize: '25px', cursor: 'pointer', boxShadow: '0 10px 24px rgba(22,163,74,0.14)' }}>♥</button>
						<span style={{ width: '46px' }} />
					</div>
					<p style={{ margin: '16px 0 0', fontSize: '12px', color: '#a29ba9' }}>{pool.length - index} anuncios por descubrir</p>
				</div>
			)}
		</section>
	);
}
