import { useEffect, useState } from 'react';
import { getSessionToken } from './app-session';
import type { AppSession } from './app-types';

/**
 * El pulso del negocio, arriba y siempre a la vista, solo para el admin.
 *
 * Los números del día vivían únicamente dentro del centro admin, así que había
 * que entrar a buscarlos. Mientras corre una campaña eso es justo lo que uno
 * quiere mirar de reojo sin salir de donde está: cuánta gente hay adentro ahora,
 * cuántas cuentas se abrieron hoy y cuánta gente llegó a la home y a la app.
 *
 * Se refresca solo cada medio minuto. No hace nada si la sesión no es de un
 * admin: el endpoint ya lo rechaza, pero pedirlo igual sería tráfico al pedo en
 * cada cuenta que abre la app.
 */
export function PulsoAdmin({ session, onAbrirCentro }: { session: AppSession; onAbrirCentro?: () => void }) {
	const [pulso, setPulso] = useState<Record<string, number> | null>(null);

	useEffect(() => {
		let vigente = true;
		const traer = async () => {
			try {
				const respuesta = await fetch('/api/admin/overview', { headers: { authorization: `Bearer ${getSessionToken(session)}` } });
				if (!respuesta.ok) return;
				const datos = await respuesta.json();
				if (vigente && datos?.metrics) setPulso(datos.metrics);
			} catch {
				// Un contador nunca puede romper la barra superior.
			}
		};
		void traer();
		const reloj = window.setInterval(traer, 30_000);
		return () => { vigente = false; window.clearInterval(reloj); };
	}, [session]);

	if (!pulso) return null;
	const dato = (valor: unknown) => Number(valor || 0).toLocaleString('es-AR');

	return (
		<button type="button" className="pulso-admin" onClick={onAbrirCentro} title="Ver el centro admin">
			{/* El punto late solo cuando hay alguien adentro: un indicador en vivo
			    sobre un cero es exactamente lo que hace desconfiar de un tablero. */}
			<span className={`pulso-dato pulso-vivo${pulso.activeUsers ? ' late' : ''}`}>
				<i />
				<b>{dato(pulso.activeUsers)}</b>
				<em>en línea</em>
			</span>
			<span className="pulso-dato">
				<b>{dato(pulso.newUsersToday)}</b>
				<em>altas hoy</em>
			</span>
			{/* Siempre PERSONAS, nunca aperturas: alguien que entra ocho veces no son
			    ocho visitantes, y un tablero que los mezcla miente para arriba. El
			    total de visitas va en el tooltip, que es donde se lo busca cuando se
			    lo necesita. */}
			<span className="pulso-dato" title={`${dato(pulso.landingViewsToday)} visitas en total`}>
				<b>{dato(pulso.landingVisitorsToday)}</b>
				<em>en la landing</em>
			</span>
			<span className="pulso-dato" title={`${dato(pulso.appViewsToday)} aperturas en total`}>
				<b>{dato(pulso.appVisitorsToday)}</b>
				<em>en la app</em>
			</span>
		</button>
	);
}
