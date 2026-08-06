import { useEffect, useState } from 'react';

/**
 * Métricas de producto en el centro admin.
 *
 * El panel mostraba listas —usuarios, pagos, generaciones— pero ninguna medida:
 * no había forma de responder "de cada diez que se registran, cuántos llegan a
 * generar" ni "cuántos abren el checkout y no pagan". Son las dos preguntas que
 * dicen dónde se pierde la gente, y son justamente las que no se podían mirar.
 */

const VENTANAS = [7, 30, 90, 365];

function porcentaje(parte: number, total: number) {
	if (!total) return 0;
	return Math.round((parte / total) * 100);
}

export function MetricsSection({ session }: { session: any }) {
	const [dias, setDias] = useState(30);
	const [datos, setDatos] = useState<any>(null);
	const [cargando, setCargando] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let vigente = true;
		setCargando(true); setError('');
		void fetch(`/api/admin/metrics?dias=${dias}`, { headers: { authorization: `Bearer ${session?.access_token || ''}` } })
			.then(async (respuesta) => {
				const carga = await respuesta.json().catch(() => ({}));
				if (!respuesta.ok) throw new Error(carga.error || 'No se pudieron cargar las métricas.');
				if (vigente) setDatos(carga);
			})
			.catch((causa) => { if (vigente) setError(causa instanceof Error ? causa.message : 'Error'); })
			.finally(() => { if (vigente) setCargando(false); });
		return () => { vigente = false; };
	}, [dias, session]);

	if (cargando && !datos) return <div className="admin-loading"><span className="studio-spinner" /><p>Calculando…</p></div>;
	if (error) return <p className="admin-error">{error}</p>;
	if (!datos) return null;

	const cima = datos.embudo[0]?.usuarios || 0;
	const maxDia = Math.max(1, ...datos.porDia.map((d: any) => d.generaciones));

	return (
		<div className="metrics">
			<div className="metrics-range" role="radiogroup" aria-label="Período">
				{VENTANAS.map((opcion) => (
					<button key={opcion} type="button" role="radio" aria-checked={dias === opcion} className={dias === opcion ? 'active' : ''} onClick={() => setDias(opcion)}>
						{opcion === 365 ? '1 año' : `${opcion} días`}
					</button>
				))}
			</div>

			<div className="metrics-cards">
				<article><small>USUARIOS</small><strong>{datos.usuarios.total}</strong><span>{datos.usuarios.nuevos} nuevos en el período</span></article>
				<article><small>ACTIVACIÓN</small><strong>{datos.usuarios.activacion}%</strong><span>de los registrados generó alguna vez</span></article>
				<article><small>GENERACIONES</small><strong>{datos.generacion.total}</strong><span>{datos.generacion.exito}% completadas · mediana {datos.generacion.segundosMediana}s</span></article>
				<article><small>INGRESOS</small><strong>{(datos.dinero.ingresoSuscripciones + datos.dinero.ingresoTokens).toFixed(2)}</strong><span>{datos.dinero.suscripcionesActivas} suscripciones activas</span></article>
			</div>

			{/* El embudo: cada paso contra el anterior, que es como se ve dónde se
			    cae la gente. Contra el total no se distingue si el problema está en
			    el primer paso o en el último. */}
			<section className="metrics-block">
				<h3>Dónde se pierde la gente</h3>
				<div className="metrics-funnel">
					{datos.embudo.map((paso: any, indice: number) => {
						const previo = indice > 0 ? datos.embudo[indice - 1].usuarios : cima;
						const caida = previo - paso.usuarios;
						return (
							<div className="funnel-step" key={paso.paso}>
								<div className="funnel-bar">
									<span style={{ width: `${porcentaje(paso.usuarios, cima)}%` }} />
								</div>
								<div className="funnel-label">
									<strong>{paso.paso}</strong>
									<span>{paso.usuarios} · {porcentaje(paso.usuarios, cima)}% del total</span>
								</div>
								{indice > 0 && caida > 0 && (
									<em className="funnel-drop">−{caida} respecto del paso anterior</em>
								)}
							</div>
						);
					})}
				</div>
			</section>

			<div className="metrics-grid">
				<section className="metrics-block">
					<h3>Actividad por día</h3>
					{datos.porDia.length ? (
						<div className="metrics-sparkline">
							{datos.porDia.map((dia: any) => (
								<span key={dia.dia} title={`${dia.dia}: ${dia.generaciones} generaciones · ${dia.usuarios} usuarios`} style={{ height: `${Math.max(4, (dia.generaciones / maxDia) * 100)}%` }} />
							))}
						</div>
					) : <p className="metrics-vacio">Sin actividad en el período.</p>}
				</section>

				<section className="metrics-block">
					<h3>Qué se genera</h3>
					<ul className="metrics-list">
						{datos.generacion.porSujeto.slice(0, 4).map((fila: any) => (
							<li key={fila.nombre}><span>{fila.nombre === 'catalog' ? 'La tienda' : fila.nombre === 'product' ? 'Un producto' : fila.nombre}</span><b>{fila.total}</b></li>
						))}
						{datos.generacion.porFormato.slice(0, 4).map((fila: any) => (
							<li key={`f-${fila.nombre}`}><span>Formato {fila.nombre}</span><b>{fila.total}</b></li>
						))}
					</ul>
				</section>

				<section className="metrics-block">
					<h3>Por qué se van</h3>
					{datos.bajas.total ? (
						<>
							<p className="metrics-nota">{datos.bajas.retenidos} de {datos.bajas.total} se quedaron tras la oferta.</p>
							<ul className="metrics-list">
								{datos.bajas.porMotivo.map((fila: any) => (
									<li key={fila.nombre}><span>{fila.nombre}</span><b>{fila.total}</b></li>
								))}
							</ul>
						</>
					) : <p className="metrics-vacio">Nadie canceló todavía.</p>}
				</section>

				<section className="metrics-block">
					<h3>Eventos registrados</h3>
					{datos.eventos.length ? (
						<ul className="metrics-list">
							{datos.eventos.map((fila: any) => (
								<li key={fila.nombre}><span>{fila.nombre.replace(/_/g, ' ')}</span><b>{fila.total}</b></li>
							))}
						</ul>
					) : <p className="metrics-vacio">Todavía no hay eventos en este período.</p>}
				</section>
			</div>

			{datos.bajas.comentarios.length > 0 && (
				<section className="metrics-block">
					<h3>Lo que dijeron al irse</h3>
					<ul className="metrics-quotes">
						{datos.bajas.comentarios.map((fila: any, indice: number) => (
							<li key={indice}>
								<q>{fila.comentario}</q>
								<small>{fila.motivo}{fila.retenido ? ' · se quedó' : ''}</small>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
